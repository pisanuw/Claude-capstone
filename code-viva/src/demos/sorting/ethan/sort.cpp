#include <utility>
#include <vector>

void insertionSortRange(std::vector<int>& v, int lo, int hi) {
    for (int i = lo + 1; i <= hi; i++) {
        int value = v[i];
        int j = i - 1;
        while (j >= lo && v[j] > value) {
            v[j + 1] = v[j];
            j--;
        }
        v[j + 1] = value;
    }
}

void insertionSort(std::vector<int>& v) {
    if (!v.empty()) {
        insertionSortRange(v, 0, static_cast<int>(v.size()) - 1);
    }
}

// Three-way partition: [lo, lt) < pivot, [lt, gt] == pivot, (gt, hi] > pivot.
void quickSort(std::vector<int>& v, int lo, int hi) {
    const int cutoff = 16;
    if (hi - lo + 1 < cutoff) {
        insertionSortRange(v, lo, hi);
        return;
    }
    int pivot = v[lo + (hi - lo) / 2];
    int lt = lo, i = lo, gt = hi;
    while (i <= gt) {
        if (v[i] < pivot) {
            std::swap(v[lt++], v[i++]);
        } else if (v[i] > pivot) {
            std::swap(v[i], v[gt--]);
        } else {
            i++;
        }
    }
    quickSort(v, lo, lt - 1);
    quickSort(v, gt + 1, hi);
}
